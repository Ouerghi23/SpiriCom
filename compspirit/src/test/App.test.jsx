import { render } from '@testing-library/react';
import { TestWrapper } from './test-wrapper';
import LandingPage from '../pages/LandingPage';

describe('App tests', () => {
  test('LandingPage renders', () => {
    const { container } = render(
      <TestWrapper>
        <LandingPage />
      </TestWrapper>
    );

    expect(container).toBeTruthy();
  });
});