import { Button, Heading, Text } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const Hero = () => {
  return (
    <div className="w-full border-b border-bibelo-rosa relative bg-bibelo-rosa">
      <div className="content-container py-16 small:py-24 flex flex-col small:flex-row items-center gap-8">
        {/* Text content */}
        <div className="flex-1 text-center small:text-left">
          <Heading
            level="h1"
            className="text-4xl small:text-5xl leading-tight text-bibelo-dark font-heading font-semibold tracking-wide"
          >
            Papelaria com{" "}
            <span className="text-bibelo-pink">curadoria especial</span>
          </Heading>
          <Text className="text-lg leading-7 text-bibelo-dark/70 mt-4 max-w-lg">
            Agendas, cadernos e acessórios que fazem do seu dia a dia algo
            especial
          </Text>
          <div className="mt-8">
            <LocalizedClientLink href="/store">
              <Button
                variant="primary"
                size="large"
                className="bg-bibelo-pink hover:bg-[#e050a8] text-white border-none px-8"
              >
                Conheça nossa loja
              </Button>
            </LocalizedClientLink>
          </div>
        </div>
        {/* Placeholder for hero image */}
        <div className="flex-1 hidden small:flex justify-center">
          <div className="w-80 h-80 rounded-full bg-white/50 flex items-center justify-center">
            <span className="text-6xl">✨</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Hero
