/**
 * NumberInput Component
 * A controlled number input with custom increment/decrement buttons
 * Disables native spinner to prevent long-press continuous changes
 */

import { useState, useEffect, useCallback } from 'react'
import { TextField, TextFieldProps, IconButton, InputAdornment, Stack } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'

interface NumberInputProps extends Omit<TextFieldProps, 'value' | 'onChange'> {
  value: number | null | undefined
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  integer?: boolean
  defaultValue?: number
}

export default function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  integer = false,
  defaultValue = 0,
  ...props
}: NumberInputProps) {
  // Local state for the input value
  const [localValue, setLocalValue] = useState<string>(
    value !== null && value !== undefined ? String(value) : String(defaultValue)
  )
  
  // Sync local value when external value changes
  useEffect(() => {
    const newValue = value !== null && value !== undefined ? String(value) : String(defaultValue)
    setLocalValue(newValue)
  }, [value, defaultValue])
  
  // Parse and validate the value
  const parseValue = useCallback((val: string): number => {
    const parsed = integer ? parseInt(val, 10) : parseFloat(val)
    if (isNaN(parsed)) return defaultValue
    
    let result = parsed
    if (min !== undefined && result < min) result = min
    if (max !== undefined && result > max) result = max
    
    // Round to step precision for floats
    if (!integer && step < 1) {
      const precision = String(step).split('.')[1]?.length || 0
      result = Number(result.toFixed(precision))
    }
    
    return result
  }, [integer, min, max, defaultValue, step])
  
  // Handle direct input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value)
  }
  
  // Handle blur - sync to parent
  const handleBlur = () => {
    const parsed = parseValue(localValue)
    setLocalValue(String(parsed))
    onChange(parsed)
  }
  
  // Handle key down - update on Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const parsed = parseValue(localValue)
      setLocalValue(String(parsed))
      onChange(parsed)
    }
  }
  
  // Increment value
  const handleIncrement = () => {
    const current = parseValue(localValue)
    let newValue = current + step
    if (max !== undefined && newValue > max) newValue = max
    
    // Round to step precision
    if (!integer && step < 1) {
      const precision = String(step).split('.')[1]?.length || 0
      newValue = Number(newValue.toFixed(precision))
    }
    
    setLocalValue(String(newValue))
    onChange(newValue)
  }
  
  // Decrement value
  const handleDecrement = () => {
    const current = parseValue(localValue)
    let newValue = current - step
    if (min !== undefined && newValue < min) newValue = min
    
    // Round to step precision
    if (!integer && step < 1) {
      const precision = String(step).split('.')[1]?.length || 0
      newValue = Number(newValue.toFixed(precision))
    }
    
    setLocalValue(String(newValue))
    onChange(newValue)
  }
  
  const currentValue = parseValue(localValue)
  const canIncrement = max === undefined || currentValue < max
  const canDecrement = min === undefined || currentValue > min
  
  return (
    <TextField
      {...props}
      type="text"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      inputProps={{
        style: { textAlign: 'center', paddingLeft: 4, paddingRight: 4 },
        ...props.inputProps
      }}
      InputProps={{
        sx: { paddingLeft: 0, paddingRight: 0 },
        startAdornment: (
          <InputAdornment position="start" sx={{ ml: 0.5, mr: 0.5 }}>
            <IconButton
              size="small"
              onClick={handleDecrement}
              disabled={!canDecrement || props.disabled}
              sx={{ p: 0.25 }}
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        ),
        endAdornment: (
          <InputAdornment position="end" sx={{ mr: 0.5, ml: 0.5 }}>
            <IconButton
              size="small"
              onClick={handleIncrement}
              disabled={!canIncrement || props.disabled}
              sx={{ p: 0.25 }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        ),
        ...props.InputProps
      }}
    />
  )
}
