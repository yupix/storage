import type { ChangeEvent } from "react"
import { useContext } from "react";
import { GetFileContext } from "#/contexts/GetFileContext";


const handleFileChange = (e:ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
    return 0;
    }
    const file = e.target.files[0]

    const reader = new FileReader()

    reader.readAsText(file)

    reader.onload = event => {
        const content = event.target?.result
        try {
            const jsonData = JSON.parse(content as string)
            console.log(jsonData)
            console.log(jsonData.files)
            return jsonData.files
            } catch (error) {
            console.error('JSONファイルを解析できませんでした。', error)
            return 0
        }
    }

    return 0
}

const FileLink = () =>{
    let x = 0
    const {fileinfo,setFile} = useContext(GetFileContext)
    return (
    <div>
        <p>test : {fileinfo}</p>
        <input type="file" accept=".json" onChange={(e) =>{
            x = handleFileChange(e);
            setFile(fileinfo+1)
            }}/>
        <div>{x}</div>
    </div>
    )
}

export { FileLink }