import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export function FilterableSelect({ 
  value, 
  onChange, 
  options = [], 
  placeholder = 'Selecciona una opción...',
  disabled = false,
  className = '',
  renderOption,
  getOptionLabel,
  getOptionValue
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  // Funciones por defecto si no se proporcionan
  const defaultGetLabel = (option) => option?.label || option
  const defaultGetValue = (option) => option?.value || option
  const defaultRenderOption = (option) => defaultGetLabel(option)

  const _getLabel = getOptionLabel || defaultGetLabel
  const _getValue = getOptionValue || defaultGetValue
  const _renderOption = renderOption || defaultRenderOption

  // Encontrar la opción seleccionada
  const selectedOption = options.find(opt => _getValue(opt) === value)
  const displayValue = selectedOption ? _getLabel(selectedOption) : ''

  // Filtrar opciones según el término de búsqueda
  const filteredOptions = options.filter(option => {
    const label = _getLabel(option).toLowerCase()
    const search = searchTerm.toLowerCase()
    return label.includes(search)
  })

  // Cerrar el dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (option) => {
    onChange(_getValue(option))
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleInputChange = (e) => {
    const value = e.target.value
    setSearchTerm(value)
    if (!isOpen) setIsOpen(true)
  }

  const handleInputFocus = () => {
    setIsOpen(true)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchTerm : displayValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          type="button"
          onClick={() => {
            if (!disabled) {
              setIsOpen(!isOpen)
              if (!isOpen) {
                inputRef.current?.focus()
              }
            }
          }}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:opacity-50"
        >
          <ChevronDown 
            size={18} 
            className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500 text-center">
              No se encontraron resultados
            </div>
          ) : (
            filteredOptions.map((option, index) => {
              const optionValue = _getValue(option)
              const isSelected = optionValue === value
              
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                    isSelected ? 'bg-blue-100 text-blue-700 font-medium' : 'text-slate-700'
                  }`}
                >
                  {_renderOption(option)}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
