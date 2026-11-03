import { Suspense } from "react"
import Link from "next/link"
import { XIcon } from "lucide-react"

import { COSTUME_KINDS, CostumeKid } from "@/components/costume-kid"
import { GuestbookForm } from "@/components/guestbook-form"
import { PasswordDialog } from "@/components/password-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { deleteEntry } from "@/lib/actions"
import { formatStamp } from "@/lib/format"
import { listEntries } from "@/lib/queries"
import { cn } from "@/lib/utils"

export default function Home(props: PageProps<"/">) {
  return (
    <div className="space-y-12">
      <GuestbookForm />
      <Suspense fallback={<EntriesSkeleton />}>
        <Entries searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}

async function Entries({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams
  const pageParam = Array.isArray(sp.page) ? sp.page[0] : sp.page
  const { entries, total, page, pageCount } = await listEntries(Number(pageParam) || 1)

  return (
    <section className="space-y-6" aria-labelledby="entries-title">
      <div className="flex items-end justify-between gap-3">
        <h2 id="entries-title" className="font-heading text-3xl leading-none">
          받은 축하 <span className="text-ink-pink">{total}</span>
        </h2>
        <div className="flex -space-x-3" aria-hidden>
          {(["chick", "frog", "cat"] as const).map((kind) => (
            <CostumeKid key={kind} kind={kind} size={34} />
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="riso-card p-8 text-center text-muted-foreground">첫 번째 축하를 남겨 주세요!</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2">
          {entries.map((entry) => (
            <li key={entry.id} className="riso-card flex flex-col gap-3 p-5" data-ink={entry.id % 3}>
              <p className="flex-1 text-[17px] leading-8 whitespace-pre-wrap">{entry.message}</p>
              <div className="flex items-center gap-2 border-t-2 border-dashed border-current/15 pt-3">
                <CostumeKid kind={COSTUME_KINDS[entry.id % COSTUME_KINDS.length]} size={30} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-heading text-lg">{entry.nickname}</span>
                  <span className="ml-2 text-xs text-muted-foreground tabular-nums">{formatStamp(entry.createdAt)}</span>
                </span>
                <PasswordDialog
                  action={deleteEntry.bind(null, entry.id)}
                  title="축하글 지우기"
                  description="글을 남길 때 정한 비밀번호를 적어 주세요."
                  confirmLabel="지우기"
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full text-muted-foreground"
                      aria-label={`${entry.nickname}님 글 지우기`}
                    >
                      <XIcon />
                    </Button>
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-center gap-4" aria-label="쪽">
          <PageLink page={page - 1} disabled={page <= 1}>
            ← 최신
          </PageLink>
          <span className="font-heading text-lg tabular-nums">
            {page} / {pageCount}
          </span>
          <PageLink page={page + 1} disabled={page >= pageCount}>
            이전 →
          </PageLink>
        </nav>
      )}
    </section>
  )
}

function PageLink({ page, disabled, children }: { page: number; disabled: boolean; children: React.ReactNode }) {
  const cls = cn(buttonVariants({ variant: "outline" }), "print-btn h-10 bg-card px-5 font-heading text-base")
  if (disabled) return <span className={cn(cls, "pointer-events-none opacity-40")}>{children}</span>
  return (
    <Link href={page > 1 ? `/?page=${page}` : "/"} className={cls}>
      {children}
    </Link>
  )
}

function EntriesSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="riso-card h-32 animate-pulse opacity-50" data-ink={i % 3} />
      ))}
    </div>
  )
}
