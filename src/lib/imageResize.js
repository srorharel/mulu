export const MAX_BYTES   = 5 * 1024 * 1024 // 5 MB cap
export const MAX_EDGE_PX = 1600

export async function resizeToBlob(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > MAX_EDGE_PX || h > MAX_EDGE_PX) {
        if (w >= h) { h = Math.round(h * MAX_EDGE_PX / w); w = MAX_EDGE_PX }
        else        { w = Math.round(w * MAX_EDGE_PX / h); h = MAX_EDGE_PX }
      }
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('toBlob failed')),
        'image/jpeg',
        0.85
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')) }
    img.src = url
  })
}
