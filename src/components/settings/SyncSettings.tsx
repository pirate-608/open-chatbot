import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { syncNow } from '../../services/sync/bootstrap.js'
import { setSyncConfig, useSyncConfig, useSyncStatus } from '../../services/sync/settings.js'
import { Button } from '../base/Button.js'
import styles from './Settings.module.css'

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) => (
  <label className={styles.syncField}>
    <span className={styles.syncFieldLabel}>{label}</span>
    <span className={styles.apiKeyInput}>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  </label>
)

/**
 * 同步设置面板：配置 GitHub 仓库与令牌、查看同步状态。
 * 只依赖 sync 模块的设置/状态，不触碰 chatbot 存储内部。保存后重载以应用后端切换。
 */
export const SyncSettings = () => {
  const t = useTranslate()
  const config = useSyncConfig()
  const status = useSyncStatus((state) => state.status)
  const [enabled, setEnabled] = useState(config.enabled)
  const [owner, setOwner] = useState(config.owner)
  const [repo, setRepo] = useState(config.repo)
  const [branch, setBranch] = useState(config.branch)
  const [token, setToken] = useState(config.token)

  const dirty =
    enabled !== config.enabled ||
    owner !== config.owner ||
    repo !== config.repo ||
    branch !== config.branch ||
    token !== config.token
  const canSave = dirty && (!enabled || (owner.trim() && repo.trim() && token.trim()))

  const save = () => {
    setSyncConfig({
      enabled,
      owner: owner.trim(),
      repo: repo.trim(),
      branch: branch.trim() || 'main',
      token: token.trim(),
    })
    location.reload()
  }

  const lastSync = status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString() : null
  const stateLabel = status?.isSyncing
    ? t('syncStatusSyncing')
    : status?.isOnline === false
      ? t('syncStatusOffline')
      : t('syncStatusOnline')

  return (
    <div className={styles.syncPanel}>
      <div className={styles.description}>{t('syncDescription')}</div>
      <label className={styles.syncToggle}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        {t('syncEnable')}
      </label>
      <div className={styles.syncFields}>
        <Field label={t('syncOwner')} value={owner} onChange={setOwner} placeholder="yourname" />
        <Field label={t('syncRepo')} value={repo} onChange={setRepo} placeholder="chatbot-data" />
        <Field label={t('syncBranch')} value={branch} onChange={setBranch} placeholder="main" />
        <Field
          label={t('syncToken')}
          value={token}
          onChange={setToken}
          placeholder={t('syncTokenPlaceholder')}
          type="password"
        />
      </div>
      <div className={styles.syncActions}>
        <Button variant="primary" size="m" disabled={!canSave} onClick={save}>
          {t('syncSave')}
        </Button>
        {config.enabled ? (
          <Button variant="outlined" size="m" onClick={() => void syncNow()}>
            {t('syncNow')}
          </Button>
        ) : null}
      </div>
      <div className={styles.syncSaveHint}>{t('syncSaveHint')}</div>
      <div className={styles.syncStatus}>
        {config.enabled ? (
          <>
            <div>{stateLabel}</div>
            {status?.pendingChanges ? (
              <div>{t('syncStatusPending', { count: status.pendingChanges })}</div>
            ) : null}
            {lastSync ? <div>{t('syncStatusLast', { time: lastSync })}</div> : null}
            {status?.rateLimitRemaining != null ? (
              <div>{t('syncStatusRate', { count: status.rateLimitRemaining })}</div>
            ) : null}
          </>
        ) : (
          <div>{t('syncStatusDisabled')}</div>
        )}
      </div>
    </div>
  )
}
