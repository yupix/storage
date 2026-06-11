declare module 'react-file-icon' {
  import type { FC } from 'react'

  export interface FileIconProps {
    extension?: string
    color?: string
    secondaryColor?: string
    labelColor?: string
    labelTextColor?: string
    type?: string
    fold?: boolean
    foldColor?: string
    glyphColor?: string
    gradientColor?: string
    gradientOpacity?: number
    radius?: number
  }

  export const FileIcon: FC<FileIconProps>
  export const defaultStyles: Record<string, FileIconProps>
}
