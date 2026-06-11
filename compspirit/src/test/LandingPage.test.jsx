import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LandingPage from '../pages/LandingPage'

describe('Landing Page - Tests Simples', () => {

  test('le composant se rend sans erreur', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  test('affiche le logo SpiriCom', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    )

    const logos = screen.getAllByAltText(/SpiriCom/i)
    expect(logos.length).toBeGreaterThan(0)
  })

  test('affiche le bouton de lancement', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    )

    // plus robuste que getByText (car doublons)
    const buttons = screen.getAllByText(/launch/i)
    expect(buttons.length).toBeGreaterThan(0)
  })

})