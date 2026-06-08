import React, { useState, createContext} from "react"

interface GetFileContextType {
    fileinfo:number
    setFile: React.Dispatch<React.SetStateAction<number>>
}

export const GetFileContext = createContext< | GetFileContextType| null>(null)

export const GetFileProvider = ({children}: {children: React.ReactNode}) =>{
    const [fileinfo, setFile] = useState<number>(0)

    return(
        <GetFileContext.Provider value={{
            fileinfo,
            setFile
        }}>
            {children}
        </GetFileContext.Provider>
    )
    
}