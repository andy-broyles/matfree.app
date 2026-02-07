// MatFree Engine - Plot Data Types

export type PlotType = 'line' | 'scatter' | 'bar' | 'stem' | 'stairs' | 'area' | 'hist'

export interface PlotSeries {
  type: PlotType
  x: number[]
  y: number[]
  color?: string
  lineWidth?: number
  markerSize?: number
  label?: string
  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'none'
  marker?: 'none' | 'circle' | 'square' | 'diamond' | 'triangle' | 'x' | 'plus'
  fillAlpha?: number
}

export interface PlotFigure {
  id: number
  series: PlotSeries[]
  title?: string
  xlabel?: string
  ylabel?: string
  grid: boolean
  legend: boolean
  hold: boolean
  xRange?: [number, number]
  yRange?: [number, number]
  width: number
  height: number
  theme: 'dark' | 'light'
}

// Modern color palette — way better than legacy primary colors
export const PALETTE = [
  '#6366f1', // indigo
  '#f43f5e', // rose
  '#22c55e', // green
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#8b5cf6', // violet
]

export function createFigure(id: number): PlotFigure {
  return {
    id, series: [], grid: true, legend: false, hold: false,
    width: 640, height: 400, theme: 'dark',
  }
}

export type PlotCallback = (figure: PlotFigure) => void
