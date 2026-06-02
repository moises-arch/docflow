import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export function MarketplaceSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="border border-[var(--color-border)]">
          <CardHeader className="flex-row items-start gap-3 space-y-0 pt-5">
            <Skeleton className="size-10 rounded-[10px]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pb-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </CardContent>
          <CardFooter className="pt-2">
            <Skeleton className="h-8 w-full rounded-md" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
