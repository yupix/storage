import { createFileRoute } from '@tanstack/react-router'
import WorkspacePage from './-workspace/WorkspacePage'
import {
  loadDrive,
  validateWorkspaceSearch,
  WorkspaceError,
  WorkspacePending,
} from './-workspace/route-utils'

export const Route = createFileRoute('/_app/home')({
  ssr: false,
  validateSearch: validateWorkspaceSearch,
  loader: () => loadDrive(),
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
  component: HomePage,
})

function HomePage() {
  const data = Route.useLoaderData()
  const { view } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <WorkspacePage
      initialFiles={data.files}
      initialFolders={data.folders}
      breadcrumb={data.breadcrumb}
      view={view ?? 'grid'}
      onViewChange={(nextView) => navigate({ search: { view: nextView } })}
    />
  )
}
