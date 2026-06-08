import { forwardRef } from 'react'
import {
  buttonClassName,
  type ButtonVariant,
  type ButtonSize,
} from '../../../lib/button-variants'

export { buttonClassName }
export type { ButtonVariant, ButtonSize }

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

/** The design-system button. For a link that looks like a button, use
 *  `buttonClassName()` on a <Link> instead of this element. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant, size, loading, disabled, className, children, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={buttonClassName({ variant, size, className })}
        {...rest}
      >
        {loading && (
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        )}
        {children}
      </button>
    )
  },
)
