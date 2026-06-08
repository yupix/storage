import { Link } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
     <header className="p-4 bg-[#ededed]">
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
          className="justify-center m-auto w-128 h-10 p-4 bg-white rounded-lg border-1 border-gray-300"
        />

        <div className="header-buttons">
          <a href=""
          className="bg-blue-500 mr-5 px-5 py-3 rounded-lg text-white font-semibold duration-300 hover:bg-blue-600">
            合言葉受信
          </a>

          <a
            href=""
            className="bg-blue-500 mx-5 px-5 py-3 rounded-lg text-white font-semibold duration-300 hover:bg-blue-600"
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
