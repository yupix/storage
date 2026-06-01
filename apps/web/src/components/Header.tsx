import { Link } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
     <header className="header-wrap">
      <nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
        <h2 className="m-0 text-base font-semibold tracking-tight">
          <Link to="/" className="inline-flex items-center ">
            HyperDrive
          </Link>
        </h2>

        <input
          type="text"
          value="検索"
          name="topSearch"
          className="search-bar"
        />

        <div className="header-buttons">
          <Link
            to="/"
            className="nav-link"
            activeProps={{ className: "nav-link is-active" }}
          >
            合言葉受信
          </Link>
          <a
            href=""
            className="nav-link"
            target="_blank"
            rel="noreferrer"
          >
            ユーザー
          </a>

          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
