import { createFileRoute } from '@tanstack/react-router'
import WorkspacePage from './-workspace/WorkspacePage'
import {
  loadDrive,
  validateWorkspaceSearch,
  WorkspaceError,
  WorkspacePending,
} from './-workspace/route-utils'

export const Route = createFileRoute('/_app/drive/')({
  ssr: false,
  validateSearch: validateWorkspaceSearch,
  loader: () => loadDrive(),
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
  component: DrivePage,
})

function DrivePage() {
  const data = Route.useLoaderData()
  const { view, sort } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <WorkspacePage
      initialFiles={data.files}
      initialFolders={data.folders}
      breadcrumb={data.breadcrumb}
      view={view ?? 'grid'}
      onViewChange={(nextView) => navigate({ search: (prev) => ({ ...prev, view: nextView }) })}
      sort={sort}
      onSortChange={(nextSort) => navigate({ search: (prev) => ({ ...prev, sort: nextSort }) })}
    />
  )
}
