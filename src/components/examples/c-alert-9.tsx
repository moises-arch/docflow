import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert"
import { CircleAlertIcon } from "lucide-react"

export function Pattern() {
  return (
    <Alert variant="invert">
      <CircleAlertIcon className="text-success" />
      <AlertTitle>Notification! All good</AlertTitle>
      <AlertDescription>
        This is a notification alert with a title and description.
      </AlertDescription>
    </Alert>
  )
}