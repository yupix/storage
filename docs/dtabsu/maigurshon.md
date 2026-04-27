# マイグレーション方法

{% hint style="info" %}
ここで紹介するコマンドは `/services/api` まで `cd` したことを前提としたものになるので、自分が今いるディレクトリに気を付けること。
{% endhint %}

### テーブルの作成

今回はユーザーテーブルを作るので `add_user_table` という名前でマイグレーションファイルを作成する。

```
sea-orm-cli migrate generate add_user_table
```

<figure><img src="../.gitbook/assets/image.png" alt=""><figcaption></figcaption></figure>

コマンドを実行すると上記のようなファイルが生成される。

`up` と `down` という関数があるのがわかると思う。`up` が新たに追加するもので `down` はそれをもとに戻すときのコードを記述する。今回の場合なら `up` には `users` テーブルを作成するコードを書き、 `down` には`users` テーブルをドロップするコードを書けばよい。



書ければ以下のコマンドを実行しデータベースに変更内容を適応する。

```
cargo run -- refresh
```

\
その後以下のコマンドを実行し、実際のデータベースからRust上で操作するためのエンティティ(モデル)を生成する。

```
sea-orm-cli generate entity -o src/entities
```

