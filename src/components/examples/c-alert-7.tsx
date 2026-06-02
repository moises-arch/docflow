import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert"
import { AlertTriangleIcon } from "lucide-react"

export function Pattern() {
  return (
    <Alert variant="warning">
      <AlertTriangleIcon
      />
      <AlertTitle>Warning! Something is wrong</AlertTitle>
      <AlertDescription>
        Please check your settings. If the problem persists, contact support.
      </AlertDescription>
    </Alert>
  )
}