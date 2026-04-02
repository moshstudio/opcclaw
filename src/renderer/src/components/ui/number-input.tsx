import * as React from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface NumberInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onChange'
> {
  value?: number
  onChange?: (value: number) => void
  min?: number
  max?: number
  step?: number
  isInvalid?: boolean
  errorText?: string
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, value = 0, onChange, min, max, step = 1, isInvalid, errorText, ...props }, ref) => {
    const handleValueChange = (newVal: number) => {
      let clampedVal = newVal
      if (min !== undefined) clampedVal = Math.max(min, clampedVal)
      if (max !== undefined) clampedVal = Math.min(max, clampedVal)
      onChange?.(clampedVal)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value
      if (rawValue === '') {
        onChange?.(0)
        return
      }

      const val = step % 1 === 0 ? parseInt(rawValue, 10) : parseFloat(rawValue)
      if (!isNaN(val)) {
        onChange?.(val)
      }
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      let val = step % 1 === 0 ? parseInt(e.target.value, 10) : parseFloat(e.target.value)
      if (isNaN(val) || e.target.value === '') {
        val = min !== undefined ? min : value || 0
      }
      handleValueChange(val)
    }

    const increment = () => {
      handleValueChange(value + step)
    }

    const decrement = () => {
      handleValueChange(value - step)
    }

    return (
      <div className="relative group w-full">
        <div className="relative w-full">
          <input
            type="number"
            className={cn(
              'flex h-11 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary/40 focus-visible:shadow-[0_0_0_2px_hsl(var(--primary)/10%),0_0_8px_hsl(var(--primary)/15%)] disabled:cursor-not-allowed disabled:opacity-50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
              isInvalid &&
                'border-destructive focus-visible:border-destructive/40 focus-visible:shadow-[0_0_0_2px_hsl(var(--destructive)/10%),0_0_8px_hsl(var(--destructive)/15%)]',
              className
            )}
            ref={ref}
            value={value === 0 && !props.placeholder ? '' : value}
            onChange={handleChange}
            onBlur={handleBlur}
            min={min}
            max={max}
            step={step}
            {...props}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={increment}
              className="p-0.5 hover:bg-accent rounded-md text-muted-foreground hover:text-accent-foreground"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={decrement}
              className="p-0.5 hover:bg-accent rounded-md text-muted-foreground hover:text-accent-foreground"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>
        {errorText && (
          <p
            className={cn(
              'absolute left-0 mt-1.5 text-[10px] text-destructive font-bold transition-all px-1 pointer-events-none whitespace-nowrap',
              isInvalid ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 invisible'
            )}
          >
            {errorText}
          </p>
        )}
      </div>
    )
  }
)
NumberInput.displayName = 'NumberInput'

export { NumberInput }
