import { createFileRoute } from '@tanstack/react-router'
import ToolbarDefault from '../components/ToolbarDefault';
import { ToolbarSelected, ToolbarSearchResult } from '../components/ToolbarDefault';

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
 <main className="pt-0 px-4 pb-8">
      <div className="flex border-red h-70vh">
        <div className="file-directory">
          <div className="directory-container">
            <h1>directory</h1>
            <ul>
              <li>ホーム</li>
              <li>フォルダー</li>
            </ul>
          </div>
        </div>
        <div className="page-content">
          <div className="toolbar-container">
            
            <ToolbarSelected />
          </div>
          <div className="content-container">
            <h3>content</h3>
          </div>
        </div>
      </div>
    </main>
  );
}
