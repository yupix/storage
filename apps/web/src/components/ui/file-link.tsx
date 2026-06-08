import type { ChangeEvent } from "react"
import { useContext } from "react";
import { GetFileContext } from "#/contexts/GetFileContext";

const FileLink = () => {
    let x
    const {fileinfo,setFile} = useContext(GetFileContext)

    //
    const jsonTonnel = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(reader.error)

            reader.readAsText(file)
        })
    }


    const handleFileChange = async (e:ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
    return;
    }

    const file = e.target.files[0]

    try {
            const content = await jsonTonnel(file)
            const jsonData = JSON.parse(content)
            console.log(jsonData)
            console.log(jsonData.files[0])
            setFile(jsonData.files[0])
            } catch (error) {
            console.error('JSONファイルを解析できませんでした。', error)
        }
    }
    return (
    <div>
        <p>test : {fileinfo}</p>
        <input type="file" accept=".json" onChange={(e) =>{
            handleFileChange(e);
            }}/>
        <div>{x}</div>
    </div>
    )
}

export { FileLink }