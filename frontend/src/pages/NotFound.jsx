import { Link } from 'react-router'
import { Compass } from 'lucide-react'
import { EmptyState } from '../components/ui/States'
import { useI18n } from '../i18n'

export default function NotFound() {
  const { t } = useI18n()
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <EmptyState icon={Compass} title={t('notFound.title')} body={t('notFound.body')} action={<Link to="/" className="btn-primary">{t('notFound.home')}</Link>} />
    </div>
  )
}
