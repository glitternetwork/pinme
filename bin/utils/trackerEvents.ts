export const TRACK_PAGES = {
  auth: 'cli_auth',
  login: 'cli_login',
  upload: 'cli_upload',
  import: 'cli_import',
  export: 'cli_export',
  remove: 'cli_remove',
  domain: 'cli_domain',
  wallet: 'cli_wallet',
  project: 'cli_project',
  deploy: 'cli_deploy',
} as const;

export const TRACK_EVENTS = {
  cliLoginSuccess: 'cli_login_success',
  cliLoginFailed: 'cli_login_failed',
  appKeySetSuccess: 'appkey_set_success',
  appKeySetFailed: 'appkey_set_failed',
  logoutSuccess: 'logout_success',
  logoutFailed: 'logout_failed',

  uploadSuccess: 'upload_success',
  uploadFailed: 'upload_failed',
  importSuccess: 'import_success',
  importFailed: 'import_failed',
  exportSuccess: 'export_success',
  exportFailed: 'export_failed',
  removeSuccess: 'remove_success',
  removeFailed: 'remove_failed',

  domainBindSuccess: 'domain_bind_success',
  domainBindFailed: 'domain_bind_failed',
  myDomainsSuccess: 'my_domains_success',
  myDomainsFailed: 'my_domains_failed',
  walletBalanceSuccess: 'wallet_balance_success',
  walletBalanceFailed: 'wallet_balance_failed',

  projectCreateSuccess: 'project_create_success',
  projectCreateFailed: 'project_create_failed',
  projectSaveSuccess: 'project_save_success',
  projectSaveFailed: 'project_save_failed',
  projectUpdateDbSuccess: 'project_update_db_success',
  projectUpdateDbFailed: 'project_update_db_failed',
  projectUpdateWorkerSuccess: 'project_update_worker_success',
  projectUpdateWorkerFailed: 'project_update_worker_failed',
  projectDeleteSuccess: 'project_delete_success',
  projectDeleteFailed: 'project_delete_failed',
  projectUpdateWebSuccess: 'project_update_web_success',
  projectUpdateWebFailed: 'project_update_web_failed',

  appKeyShownSuccess: 'appkey_shown_success',
  appKeyShownFailed: 'appkey_shown_failed',
  uploadHistoryViewed: 'upload_history_viewed',
  uploadHistoryCleared: 'upload_history_cleared',
  uploadHistoryFailed: 'upload_history_failed',
} as const;

export const TRACK_ACTIONS = {
  init: 'init',
  click: 'click',
  view: 'view',
  exposure: 'exposure',
  submit: 'submit',
  success: 'success',
  fail: 'fail',
} as const;

export function resolveTrackAction(event: string): string {
  switch (event) {
    case TRACK_EVENTS.uploadHistoryViewed:
    case TRACK_EVENTS.myDomainsSuccess:
    case TRACK_EVENTS.walletBalanceSuccess:
    case TRACK_EVENTS.appKeyShownSuccess:
      return TRACK_ACTIONS.view;
    case TRACK_EVENTS.uploadHistoryCleared:
      return TRACK_ACTIONS.click;
    case TRACK_EVENTS.uploadSuccess:
    case TRACK_EVENTS.importSuccess:
    case TRACK_EVENTS.exportSuccess:
    case TRACK_EVENTS.removeSuccess:
    case TRACK_EVENTS.domainBindSuccess:
    case TRACK_EVENTS.cliLoginSuccess:
    case TRACK_EVENTS.appKeySetSuccess:
    case TRACK_EVENTS.logoutSuccess:
    case TRACK_EVENTS.projectCreateSuccess:
    case TRACK_EVENTS.projectSaveSuccess:
    case TRACK_EVENTS.projectUpdateDbSuccess:
    case TRACK_EVENTS.projectUpdateWorkerSuccess:
    case TRACK_EVENTS.projectUpdateWebSuccess:
    case TRACK_EVENTS.projectDeleteSuccess:
      return TRACK_ACTIONS.success;
    case TRACK_EVENTS.uploadFailed:
    case TRACK_EVENTS.importFailed:
    case TRACK_EVENTS.exportFailed:
    case TRACK_EVENTS.removeFailed:
    case TRACK_EVENTS.domainBindFailed:
    case TRACK_EVENTS.cliLoginFailed:
    case TRACK_EVENTS.appKeySetFailed:
    case TRACK_EVENTS.logoutFailed:
    case TRACK_EVENTS.myDomainsFailed:
    case TRACK_EVENTS.walletBalanceFailed:
    case TRACK_EVENTS.projectCreateFailed:
    case TRACK_EVENTS.projectSaveFailed:
    case TRACK_EVENTS.projectUpdateDbFailed:
    case TRACK_EVENTS.projectUpdateWorkerFailed:
    case TRACK_EVENTS.projectUpdateWebFailed:
    case TRACK_EVENTS.projectDeleteFailed:
    case TRACK_EVENTS.appKeyShownFailed:
    case TRACK_EVENTS.uploadHistoryFailed:
      return TRACK_ACTIONS.fail;
    default:
      return TRACK_ACTIONS.view;
  }
}
