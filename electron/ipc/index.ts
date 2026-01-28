// IPC channel constants
export const IPC_CHANNELS = {
  // App
  GET_APP_PATH: 'get-app-path',
  GET_USER_DATA_PATH: 'get-user-data-path',
  
  // Help
  READ_HELP_FILES: 'read-help-files',
  
  // File dialogs
  OPEN_FILE_DIALOG: 'open-file-dialog',
  SAVE_FILE_DIALOG: 'save-file-dialog'
} as const

export type IPCChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]

