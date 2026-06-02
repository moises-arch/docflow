import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert"
import { CircleCheckIcon } from "lucide-react"

export function Pattern() {
  return (
    <Alert variant="success">
      <CircleCheckIcon
      />
      <AlertTitle>Success! All good</AlertTitle>
      <AlertDescription>
        Everything is working as expected. You can continue with your task.
      </AlertDescription>
    </Alert>
  )
}