interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <div className="border-b border-night-dark-gray bg-night-gray">
      <div className="p-8">
        <h1 className="text-4xl font-bold text-night-silver mb-2">{title}</h1>
        {subtitle && <p className="text-night-dark-gray">{subtitle}</p>}
      </div>
    </div>
  )
}
