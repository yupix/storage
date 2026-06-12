import { createFileRoute } from '@tanstack/react-router'
import WorkspacePage from './-workspace/WorkspacePage'
import {
  loadTrash,
  validateWorkspaceSearch,
  WorkspaceError,
  WorkspacePending,
} from './-workspace/route-utils'

export const Route = createFileRoute('/_app/trash')({
  ssr: false,
  validateSearch: validateWorkspaceSearch,
  loader: loadTrash,
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
  component: TrashPage,
})

function TrashPage() {
  const data = Route.useLoaderData()
  const { view } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <WorkspacePage
      initialFiles={data.files}
      initialFolders={data.folders}
      breadcrumb={data.breadcrumb}
      mode="trash"
      view={view ?? 'grid'}
      onViewChange={(nextView) => navigate({ search: { view: nextView } })}
    />
  )
}
