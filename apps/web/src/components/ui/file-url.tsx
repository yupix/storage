import { useContext } from "react";
import { GetFileContext } from "#/contexts/GetFileContext";

const FileUrl = () => {
    const {fileinfo, setFile} = useContext(GetFileContext);
    
    return(
        <div>
            <p>
                test: {fileinfo}
            </p>
        </div>
    )
}

export { FileUrl }