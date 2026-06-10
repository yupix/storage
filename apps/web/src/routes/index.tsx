import { createFileRoute } from '@tanstack/react-router'
import ToolbarDefault from '../components/ToolbarDefault';
import { ToolbarSelected, ToolbarSearchResult } from '../components/ToolbarDefault';
import MainContentsDefault from '#/components/MainContents';

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
 <main className="pt-0 px-4 pb-8 bg-background">
      <div className="flex h-[70vh] min-h-full">
        <div className="min-w-[20%]">
          <div className="bg-card text-card-foreground rounded-lg h-full m-[0.5rem] p-4">
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
            <MainContentsDefault />
          </div>
        </div>
      </div>
    </main>
  );
}
