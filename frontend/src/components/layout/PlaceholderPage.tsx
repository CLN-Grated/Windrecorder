import { useT } from "@/lib/i18n"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function PlaceholderPage({
  titleKey,
  description,
}: {
  titleKey: string
  description?: string
}) {
  const t = useT()
  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{t(titleKey)}</CardTitle>
            <Badge variant="secondary">WIP</Badge>
          </div>
          <CardDescription>
            {description || "Batch migration pending — shell route is ready."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          此页面路由已就绪，业务功能将在后续批次迁移。
        </CardContent>
      </Card>
    </div>
  )
}
