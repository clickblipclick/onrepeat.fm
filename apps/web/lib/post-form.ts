/** A post is "dirty" — worth a discard-confirm before dismissing the modal — once the
 *  user has selected/typed a track or typed a caption. `trackContent` is reported by the
 *  TrackPicker (a track is selected or the search/URL field is non-empty); `caption` is
 *  the optional note field. Pure so it can be unit-tested without the React tree. */
export function isPostDirty(args: {
  trackContent: boolean
  caption: string
}): boolean {
  return args.trackContent || args.caption.trim().length > 0
}
