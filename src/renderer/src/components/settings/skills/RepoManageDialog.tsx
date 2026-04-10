import React, { useState } from 'react'
import { Settings, Github, ExternalLink, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useConfigStore } from '@renderer/store/useConfigStore'
import { useConfirm } from '@renderer/hooks/use-confirm'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogBody
} from '@renderer/components/ui/dialog'

/**
 * 仓库管理对话框
 */
export const RepoManageDialog: React.FC = () => {
  const { t } = useTranslation()
  const { config, updateConfig } = useConfigStore()
  const confirm = useConfirm()

  const [newUrl, setNewUrl] = useState('')
  const [newBranch, setNewBranch] = useState('')

  const handleAdd = async () => {
    if (!newUrl) return
    const repos = [...(config?.skillsRepositories || [])]
    if (repos.some((r) => r.url === newUrl)) {
      toast.error('仓库已存在')
      return
    }
    repos.push({ source: 'github', url: newUrl, branch: newBranch || undefined })
    await updateConfig({ skillsRepositories: repos })
    setNewUrl('')
    setNewBranch('')
    toast.success(t('common.success'))
  }

  const handleDelete = async (url: string) => {
    const isConfirmed = await confirm({
      title: t('common.delete'),
      description: t('skills.repo_delete_confirm'),
      variant: 'destructive'
    })

    if (isConfirmed.confirmed) {
      const repos = (config?.skillsRepositories || []).filter((r) => r.url !== url)
      await updateConfig({ skillsRepositories: repos })
      toast.success(t('common.success'))
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-10 h-10 rounded-xl">
          <Settings className="w-5 h-5 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('skills.repo_manage')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-6">
          <div className="flex gap-2 items-end">
            <div className="grid gap-2 flex-1">
              <Label>{t('skills.repo_url')}</Label>
              <Input
                placeholder="Owner/Repo"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </div>
            <div className="grid gap-2 w-32">
              <Label>{t('skills.repo_branch')}</Label>
              <Input
                placeholder="main"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
              />
            </div>
            <Button onClick={handleAdd}>{t('common.add')}</Button>
          </div>

          <div className="border rounded-2xl overflow-hidden">
            <div className="divide-y">
              {(config?.skillsRepositories || []).map((repo) => (
                <div
                  key={repo.url}
                  className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl text-primary">
                      <Github className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">{repo.url}</div>
                      <div className="text-xs text-muted-foreground">{repo.branch || 'main'}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-xl"
                      onClick={() => window.open(`https://github.com/${repo.url}`, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-xl text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(repo.url)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
