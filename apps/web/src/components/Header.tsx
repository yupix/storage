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
          className="justify-center m-auto w-96 h-8 p-4 bg-white rounded-full border-2 border-gray-300"
        />

        <div className="header-buttons">
          <a href=""
          className="bg-blue-500 mx-5 px-5 py-2 rounded-lg text-white font-bold">
            合言葉受信
          </a>

          <a
            href=""
            className="bg-blue-500 mx-10 px-5 py-2 rounded-lg text-white font-bold"
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
