export default function BrandLogo({ className = '' }) {
  return (
    <img
      src="/adix-paper-logo.png"
      alt="Adix Paper"
      className={`h-full w-full object-contain ${className}`}
    />
  )
}
