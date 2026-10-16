// Browser file opening. A picked file is read immediately and held under a
// pseudo-path ("browser:/<n>/<name>") that the shared workflows pass back to
// readFile, exactly as they would a desktop path. Only the most recent few
// stay in memory; nothing is written to browser storage.

const MAX_HELD_FILES = 4
const held = new Map<string, string>()
let counter = 0

function hold(name: string, text: string): string {
  const path = `browser:/${++counter}/${name}`
  held.set(path, text)
  while (held.size > MAX_HELD_FILES) held.delete(held.keys().next().value!)
  return path
}

/** Shows the file picker; resolves to a pseudo-path, or null when cancelled. */
export function pickFile(accept: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.addEventListener('cancel', () => resolve(null))
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      file.text().then(text => resolve(hold(file.name, text)), reject)
    })
    input.click()
  })
}

export function readHeldFile(path: string): Promise<string> {
  const text = held.get(path)
  return text === undefined
    ? Promise.reject(new Error('This file is no longer open in the browser. Choose it again with Open.'))
    : Promise.resolve(text)
}
