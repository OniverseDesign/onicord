import React from 'react'

export default function MaterialIcon({
  name,
  className = '',
  size = 24,
  fill = false,
  weight = 300,
  grade = 0,
  onClick,
  style = {},
  ...props
}) {

  const presetSizes = {
    xs: 14,
    sm: 16,
    base: 18,
    lg: 22,
    xl: 24,
    '2xl': 30,
    '3xl': 36,
  }

  const resolvedSize =
    typeof size === 'string'
      ? presetSizes[size] || 24
      : size

  const classes = [
    'material-symbols-outlined',
    'select-none',
    'shrink-0',
    'inline-flex',
    'items-center',
    'justify-center',
    onClick ? 'cursor-pointer hover:opacity-80 active:scale-95 transition duration-150' : '',
    className
  ].filter(Boolean).join(' ')

  return (
    <span
      aria-hidden="true"
      onClick={onClick}
      className={classes}
      style={{
        fontSize: `${resolvedSize}px`,
        lineHeight: 1,
        fontVariationSettings: `
          'FILL' ${fill ? 1 : 0},
          'wght' ${weight},
          'GRAD' ${grade},
          'opsz' ${resolvedSize}
        `,
        ...style
      }}
      {...props}
    >
      {name}
    </span>
  )
}