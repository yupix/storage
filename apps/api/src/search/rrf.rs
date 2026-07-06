use std::collections::HashMap;

use sea_orm::prelude::Uuid;

use crate::entities::files;

/// RRF の k 定数（文献標準値）
pub const RRF_K: f64 = 60.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MatchReason {
    Keyword,
    Vector,
    Both,
}

impl MatchReason {
    pub fn as_str(self) -> &'static str {
        match self {
            MatchReason::Keyword => "keyword",
            MatchReason::Vector => "vector",
            MatchReason::Both => "both",
        }
    }
}

pub struct FusedRank {
    pub file_id: Uuid,
    pub match_reason: MatchReason,
    pub rrf_score: f64,
}

pub struct FusedHit {
    pub file: files::Model,
    pub match_reason: MatchReason,
    pub rrf_score: f64,
}

/// ページング用に各経路から取得する件数の下限
pub fn fusion_depth(page: u64, limit: u64) -> u64 {
    std::cmp::max(100, page * limit + limit)
}

/// Reciprocal Rank Fusion: RRF_score(d) = Σ 1/(k + rank_i(d))
pub fn fuse_rrf_ranked(
    keyword_ranked: &[Uuid],
    vector_ranked: &[Uuid],
    k: f64,
) -> Vec<FusedRank> {
    let mut scores: HashMap<Uuid, (f64, MatchReason)> = HashMap::new();

    for (rank, file_id) in keyword_ranked.iter().enumerate() {
        let rank_1 = (rank + 1) as f64;
        let contribution = 1.0 / (k + rank_1);
        scores
            .entry(*file_id)
            .and_modify(|(score, reason)| {
                *score += contribution;
                if *reason == MatchReason::Vector {
                    *reason = MatchReason::Both;
                }
            })
            .or_insert((contribution, MatchReason::Keyword));
    }

    for (rank, file_id) in vector_ranked.iter().enumerate() {
        let rank_1 = (rank + 1) as f64;
        let contribution = 1.0 / (k + rank_1);
        scores
            .entry(*file_id)
            .and_modify(|(score, reason)| {
                *score += contribution;
                if *reason == MatchReason::Keyword {
                    *reason = MatchReason::Both;
                }
            })
            .or_insert((contribution, MatchReason::Vector));
    }

    let mut fused: Vec<FusedRank> = scores
        .into_iter()
        .map(|(file_id, (rrf_score, match_reason))| FusedRank {
            file_id,
            match_reason,
            rrf_score,
        })
        .collect();

    fused.sort_by(|a, b| {
        b.rrf_score
            .partial_cmp(&a.rrf_score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.file_id.cmp(&b.file_id))
    });

    fused
}

pub fn fuse_rrf(
    keyword_ranked: &[files::Model],
    vector_ranked: &[files::Model],
    k: f64,
) -> Vec<FusedHit> {
    let keyword_ids: Vec<Uuid> = keyword_ranked.iter().map(|f| f.id).collect();
    let vector_ids: Vec<Uuid> = vector_ranked.iter().map(|f| f.id).collect();
    let files_by_id: HashMap<Uuid, files::Model> = keyword_ranked
        .iter()
        .chain(vector_ranked.iter())
        .map(|f| (f.id, f.clone()))
        .collect();

    fuse_rrf_ranked(&keyword_ids, &vector_ids, k)
        .into_iter()
        .filter_map(|rank| {
            files_by_id.get(&rank.file_id).map(|file| FusedHit {
                file: file.clone(),
                match_reason: rank.match_reason,
                rrf_score: rank.rrf_score,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rrf_score_same_rank_in_both_lists() {
        let id_a = Uuid::new_v4();
        let id_b = Uuid::new_v4();
        let keyword = vec![id_a, id_b];
        let vector = vec![id_a, id_b];

        let fused = fuse_rrf_ranked(&keyword, &vector, RRF_K);

        assert_eq!(fused.len(), 2);
        assert_eq!(fused[0].file_id, id_a);
        assert_eq!(fused[0].match_reason, MatchReason::Both);
        assert_eq!(fused[1].match_reason, MatchReason::Both);
        let score_a = 2.0 / (RRF_K + 1.0);
        let score_b = 2.0 / (RRF_K + 2.0);
        assert!((fused[0].rrf_score - score_a).abs() < f64::EPSILON);
        assert!((fused[1].rrf_score - score_b).abs() < f64::EPSILON);
    }

    #[test]
    fn rrf_deduplicates_by_file_id() {
        let id_shared = Uuid::new_v4();
        let id_kw_only = Uuid::new_v4();
        let keyword = vec![id_shared, id_kw_only];
        let vector = vec![id_shared];

        let fused = fuse_rrf_ranked(&keyword, &vector, RRF_K);

        assert_eq!(fused.len(), 2);
        let shared = fused.iter().find(|h| h.file_id == id_shared).unwrap();
        assert_eq!(shared.match_reason, MatchReason::Both);
        let kw_only = fused.iter().find(|h| h.file_id == id_kw_only).unwrap();
        assert_eq!(kw_only.match_reason, MatchReason::Keyword);
    }

    #[test]
    fn rrf_prefers_document_in_both_lists() {
        let id_both = Uuid::new_v4();
        let id_vector_only = Uuid::new_v4();
        let keyword = vec![id_both];
        let vector = vec![id_both, id_vector_only];

        let fused = fuse_rrf_ranked(&keyword, &vector, RRF_K);

        assert_eq!(fused[0].file_id, id_both);
        assert_eq!(fused[0].match_reason, MatchReason::Both);
        assert!(fused[0].rrf_score > fused[1].rrf_score);
    }

    #[test]
    fn rrf_score_calculation_single_list() {
        let id = Uuid::new_v4();
        let keyword = vec![id];
        let fused = fuse_rrf_ranked(&keyword, &[], RRF_K);

        assert_eq!(fused.len(), 1);
        assert_eq!(fused[0].match_reason, MatchReason::Keyword);
        let expected = 1.0 / (RRF_K + 1.0);
        assert!((fused[0].rrf_score - expected).abs() < f64::EPSILON);
    }

    #[test]
    fn degraded_fallback_returns_keyword_only_results() {
        let id_kw = Uuid::new_v4();
        let id_vec = Uuid::new_v4();
        let keyword = vec![id_kw];
        let vector: Vec<Uuid> = vec![];

        let fused = fuse_rrf_ranked(&keyword, &vector, RRF_K);

        assert_eq!(fused.len(), 1);
        assert_eq!(fused[0].file_id, id_kw);
        assert_eq!(fused[0].match_reason, MatchReason::Keyword);
        let _ = id_vec;
    }

    #[test]
    fn hybrid_merge_combines_distinct_keyword_and_vector_hits() {
        let id_kw = Uuid::new_v4();
        let id_vec = Uuid::new_v4();
        let keyword = vec![id_kw];
        let vector = vec![id_vec];

        let fused = fuse_rrf_ranked(&keyword, &vector, RRF_K);

        assert_eq!(fused.len(), 2);
        let reasons: Vec<MatchReason> = fused.iter().map(|h| h.match_reason).collect();
        assert!(reasons.contains(&MatchReason::Keyword));
        assert!(reasons.contains(&MatchReason::Vector));
    }

    #[test]
    fn fusion_depth_uses_minimum_100() {
        assert_eq!(fusion_depth(1, 10), 100);
        assert_eq!(fusion_depth(5, 50), 300);
    }
}
