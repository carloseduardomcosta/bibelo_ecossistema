import { Button, Heading, Text } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const Hero = () => {
  return (
    <div className="h-[75vh] w-full border-b border-bibelo-blush relative bg-bibelo-cream">
      <div className="absolute inset-0 z-10 flex flex-col justify-center items-center text-center small:p-32 gap-6">
        <span>
          <Heading
            level="h1"
            className="text-4xl leading-tight text-bibelo-bark font-heading font-semibold tracking-wide"
          >
            Papelaria com curadoria especial
          </Heading>
          <Text className="text-xl leading-8 text-bibelo-rose mt-4 max-w-xl mx-auto">
            Agendas, cadernos e acessórios que fazem do seu dia a dia algo
            especial
          </Text>
        </span>
        <LocalizedClientLink href="/store">
          <Button
            variant="primary"
            size="large"
            className="mt-4"
          >
            Conheça nossa loja
          </Button>
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default Hero
