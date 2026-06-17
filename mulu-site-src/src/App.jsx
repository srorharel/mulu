import { DownloadProvider } from './components/download-context.jsx'
import { DownloadModal } from './components/DownloadModal.jsx'
import { BubblesBackground } from './components/BubblesBackground.jsx'
import { Nav } from './sections/Nav.jsx'
import { Hero } from './sections/Hero.jsx'
import { HowItWorks } from './sections/HowItWorks.jsx'
import { WhyTrust } from './sections/WhyTrust.jsx'
import { Services } from './sections/Services.jsx'
import { ForWashers } from './sections/ForWashers.jsx'
import { Timeline } from './sections/Timeline.jsx'
import { FinalCTA } from './sections/FinalCTA.jsx'
import { Footer } from './sections/Footer.jsx'

export default function App() {
  return (
    <DownloadProvider>
      <BubblesBackground />
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <WhyTrust />
        <Services />
        <ForWashers />
        <Timeline />
        <FinalCTA />
      </main>
      <Footer />
      <DownloadModal />
    </DownloadProvider>
  )
}
