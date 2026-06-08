import { createFileRoute } from '@tanstack/react-router'
import ToolbarDefault from '../components/ToolbarDefault';
import { ToolbarSelected, ToolbarSearchResult } from '../components/ToolbarDefault';

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
 <main className="pt-0 px-4 pb-8 bg-[#ededed]">
      <div className="flex h-[70vh] min-h-full">
        <div className="min-w-[20%]">
          <div className="bg-white rounded-lg h-full m-[0.5rem] p-4">
            <h1>directory</h1>
            <ul>
              <li>ホーム</li>
              <li>フォルダー</li>
            </ul>
          </div>
        </div>
        <div className="min-w-[80%]">
          <div className="height-[10%]">
            
            <ToolbarSelected />
          </div>
          <div className="h-[90%] outline-1">
            <h3>content</h3>
          </div>
        </div>
      </div>
    </main>
  );
}
