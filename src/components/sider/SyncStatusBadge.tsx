import { useTranslate } from '../../i18n/index.js'
import { useSyncConfig, useSyncStatus } from '../../services/sync/settings.js'
import { IconRefreshOutline16 } from '../base/icons.js'
import { openSettings } from '../settings/settingsDialogState.js'
import styles from './Sider.module.css'

/** 侧边栏底部的同步状态徽标：仅在启用同步时显示，点击打开同步设置。 */
export const SyncStatusBadge = () => {
  const t = useTranslate()
  const enabled = useSyncConfig((state) => state.enabled)
  const status = useSyncStatus((state) => state.status)
  if (!enabled) {
    return null
  }
  const label = status?.isSyncing
    ? t('syncStatusSyncing')
    : status?.isOnline === false
      ? t('syncStatusOffline')
      : t('syncStatusOnline')
  return (
    <button
      type="button"
      className={styles.syncBadge}
      title={label}
      aria-label={label}
      onClick={() => openSettings('sync')}
    >
      <IconRefreshOutline16 />
      <span>{t('syncBadge')}</span>
      {status?.pendingChanges ? (
        <span className={styles.syncBadgeCount}>{status.pendingChanges}</span>
      ) : null}
    </button>
  )
}
