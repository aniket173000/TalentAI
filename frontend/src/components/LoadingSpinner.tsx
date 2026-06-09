interface Props {
  message?: string
}

export default function LoadingSpinner({ message = 'Processing…' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
        <div className="absolute inset-0 rounded-full border-4 border-brand-blue border-t-transparent animate-spin" />
      </div>
      <p className="text-slate-500 text-sm font-medium">{message}</p>
    </div>
  )
}
