import type { LucideIcon } from 'lucide-react'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

type SectionPlaceholderProps = {
  icon: LucideIcon
  title: string
  description: string
}

export function SectionPlaceholder({
  icon: Icon,
  title,
  description,
}: SectionPlaceholderProps) {
  return (
    <Empty className="flex-1 rounded-lg border border-dashed border-border bg-card/40">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription className="max-w-md text-pretty">
          {description}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
