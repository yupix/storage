export const SecondaryContents = () => {
    return (
    <div className="">

    </div>
    )
};

export default function MainContentsDefault() {
  return (
   <div className="m-2 max-w-[200px] max-h-[125px] w-full h-full bg-white rounded-lg p-4">
        <div className="max-w-[75px] max-h-[75px] w-full h-full">
            <h1>ファイルプレビューここ</h1>
            <img src="" alt="" />
        </div>
        <div className="flex justify-between object-bottom">
            <p className="font-semibold">ファイル名</p>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ellipsis-vertical-icon lucide-ellipsis-vertical duration-300 hover:scale-110 cursor-pointer"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        </div>
    </div>
  )
}

