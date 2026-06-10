export default function Footer() {
  const year = new Date().getFullYear()

  return (
   <footer className="pt-1 border-t px-4 pb-14 bg-background text-muted-foreground">
      <div className="page-wrap flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-sm">U22プロジェクト</p>
        <p className="island-kicker m-0">&copy;HyperDrive2026</p>
      </div>
    </footer>
  )
}
