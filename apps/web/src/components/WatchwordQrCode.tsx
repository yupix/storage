import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

interface WatchwordQrCodeProps {
  value: string
  size?: number
  className?: string
}

export default function WatchwordQrCode({ value, size = 160, className }: WatchwordQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
    }).then((url) => {
      if (!cancelled) setDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [value, size])

  if (!dataUrl) {
    return (
      <div
        className={className}
        style={{ width: size, height: size }}
        aria-hidden
      />
    )
  }

  return (
    <img
      src={dataUrl}
      alt={`合言葉 QR コード: ${value}`}
      width={size}
      height={size}
      className={className}
    />
  )
}
