// Which build of the web app is running: "sha-<commit>" from CI, "dev" locally.
// It is the build the browser loaded, which can briefly differ from what is
// deployed if a tab has been open since before a deploy.
export const webVersion: string = __WEB_VERSION__
