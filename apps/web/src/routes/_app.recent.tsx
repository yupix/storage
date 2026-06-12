import { createFileRoute } from '@tanstack/react-router'
import WorkspacePage from './-workspace/WorkspacePage'
import {
  loadRecent,
  validateWorkspaceSearch,
  WorkspaceError,
  WorkspacePending,
} from './-workspace/route-utils'

export const Route = createFileRoute('/_app/recent')({
  ssr: false,
  validateSearch: validateWorkspaceSearch,
  loader: loadRecent,
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
  component: RecentPage,
})

function RecentPage() {
  const data = Route.useLoaderData()
  const { view } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <WorkspacePage
      initialFiles={data.files}
      breadcrumb={data.breadcrumb}
      view={view ?? 'grid'}
      onViewChange={(nextView) => navigate({ search: { view: nextView } })}
    />
  )
}
