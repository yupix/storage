import { createFileRoute } from '@tanstack/react-router'
import ToolbarDefault from '../components/ToolbarDefault';
import { ToolbarSelected } from '../components/ToolbarDefault';

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
 <main className="page-wrap px-4 pb-8 pt-14">
      <div className="page-divider">
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
