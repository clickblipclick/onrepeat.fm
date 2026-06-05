/** Parse the authority (the repo DID) out of an at-uri `at://<did>/<collection>/<rkey>`. */
export function didFromUri(uri: string): string {
  return uri.replace(/^at:\/\//, '').split('/')[0] ?? ''
}

/** The record key is the final path segment of an at-uri (tolerates a trailing slash). */
export function rkeyFromUri(uri: string): string {
  return uri.replace(/\/$/, '').split('/').pop() ?? ''
}
