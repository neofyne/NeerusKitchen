import AppKit

let outputDirectory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
  .appendingPathComponent("public", isDirectory: true)

func writePNG(_ image: NSImage, name: String) throws {
  guard let data = image.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: data),
        let png = bitmap.representation(using: .png, properties: [:]) else {
    throw NSError(domain: "NeerusKitchenAssets", code: 1)
  }
  try png.write(to: outputDirectory.appendingPathComponent(name))
}

func writeJPEG(_ image: NSImage, name: String, quality: CGFloat = 0.82) throws {
  guard let data = image.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: data),
        let jpeg = bitmap.representation(using: .jpeg, properties: [.compressionFactor: quality]) else {
    throw NSError(domain: "NeerusKitchenAssets", code: 2)
  }
  try jpeg.write(to: outputDirectory.appendingPathComponent(name))
}

func drawLogo(in rect: NSRect) {
  NSColor(calibratedRed: 0.93, green: 0.32, blue: 0.13, alpha: 1).setFill()
  NSBezierPath(roundedRect: rect, xRadius: rect.width * 0.24, yRadius: rect.width * 0.24).fill()

  NSColor.white.setStroke()
  NSColor.white.setFill()
  let line = max(3, rect.width * 0.045)
  for offset in [0.34, 0.50, 0.66] {
    let steam = NSBezierPath()
    steam.lineWidth = line
    steam.lineCapStyle = .round
    steam.move(to: NSPoint(x: rect.minX + rect.width * offset, y: rect.minY + rect.height * 0.68))
    steam.curve(to: NSPoint(x: rect.minX + rect.width * (offset + 0.01), y: rect.minY + rect.height * 0.84),
                controlPoint1: NSPoint(x: rect.minX + rect.width * (offset - 0.07), y: rect.minY + rect.height * 0.75),
                controlPoint2: NSPoint(x: rect.minX + rect.width * (offset + 0.08), y: rect.minY + rect.height * 0.78))
    steam.stroke()
  }

  let bowl = NSBezierPath()
  bowl.move(to: NSPoint(x: rect.minX + rect.width * 0.25, y: rect.minY + rect.height * 0.48))
  bowl.line(to: NSPoint(x: rect.minX + rect.width * 0.75, y: rect.minY + rect.height * 0.48))
  bowl.curve(to: NSPoint(x: rect.minX + rect.width * 0.50, y: rect.minY + rect.height * 0.25),
             controlPoint1: NSPoint(x: rect.minX + rect.width * 0.72, y: rect.minY + rect.height * 0.32),
             controlPoint2: NSPoint(x: rect.minX + rect.width * 0.62, y: rect.minY + rect.height * 0.25))
  bowl.curve(to: NSPoint(x: rect.minX + rect.width * 0.25, y: rect.minY + rect.height * 0.48),
             controlPoint1: NSPoint(x: rect.minX + rect.width * 0.38, y: rect.minY + rect.height * 0.25),
             controlPoint2: NSPoint(x: rect.minX + rect.width * 0.28, y: rect.minY + rect.height * 0.32))
  bowl.fill()

  let rim = NSBezierPath()
  rim.lineWidth = line
  rim.lineCapStyle = .round
  rim.move(to: NSPoint(x: rect.minX + rect.width * 0.20, y: rect.minY + rect.height * 0.49))
  rim.line(to: NSPoint(x: rect.minX + rect.width * 0.80, y: rect.minY + rect.height * 0.49))
  rim.stroke()
}

func drawText(_ text: String, at point: NSPoint, font: NSFont, color: NSColor, tracking: CGFloat = 0) {
  let style = NSMutableParagraphStyle()
  style.lineSpacing = 2
  (text as NSString).draw(at: point, withAttributes: [
    .font: font,
    .foregroundColor: color,
    .kern: tracking,
    .paragraphStyle: style,
  ])
}

let card = NSImage(size: NSSize(width: 1200, height: 630))
card.lockFocus()
NSColor(calibratedRed: 0.985, green: 0.975, blue: 0.945, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: 1200, height: 630).fill()

let photoURL = outputDirectory.appendingPathComponent("food/paneer-sandwich.jpg")
if let photo = NSImage(contentsOf: photoURL) {
  let photoFrame = NSRect(x: 735, y: 45, width: 420, height: 540)
  NSGraphicsContext.saveGraphicsState()
  NSBezierPath(roundedRect: photoFrame, xRadius: 42, yRadius: 42).addClip()
  let side = min(photo.size.width, photo.size.height)
  let source = NSRect(x: (photo.size.width - side) / 2, y: (photo.size.height - side) / 2, width: side, height: side)
  photo.draw(in: photoFrame, from: source, operation: .sourceOver, fraction: 1)
  NSGraphicsContext.restoreGraphicsState()
}

drawLogo(in: NSRect(x: 68, y: 474, width: 92, height: 92))
let ink = NSColor(calibratedRed: 0.08, green: 0.13, blue: 0.10, alpha: 1)
let muted = NSColor(calibratedRed: 0.36, green: 0.42, blue: 0.38, alpha: 1)
let orange = NSColor(calibratedRed: 0.79, green: 0.24, blue: 0.08, alpha: 1)
drawText("Neeru’s Kitchen", at: NSPoint(x: 186, y: 520), font: .systemFont(ofSize: 38, weight: .heavy), color: ink)
drawText("100% VEGETARIAN · HOME-COOKED", at: NSPoint(x: 188, y: 487), font: .systemFont(ofSize: 14, weight: .bold), color: muted, tracking: 1.3)
drawText("Fresh food.", at: NSPoint(x: 68, y: 326), font: .systemFont(ofSize: 66, weight: .heavy), color: ink)
drawText("Feels like home.", at: NSPoint(x: 68, y: 247), font: .systemFont(ofSize: 66, weight: .heavy), color: orange)
drawText("Order today’s freshly prepared vegetarian meals.", at: NSPoint(x: 72, y: 180), font: .systemFont(ofSize: 23, weight: .medium), color: muted)
drawText("neerus-kitchen.netlify.app", at: NSPoint(x: 72, y: 77), font: .systemFont(ofSize: 19, weight: .bold), color: ink)
card.unlockFocus()
try writePNG(card, name: "neerus-kitchen-share.png")

// WhatsApp often renders a compact square thumbnail. Keep the logo and food
// recognizable even when the image is reduced to roughly 80 × 80 pixels.
let whatsappCard = NSImage(size: NSSize(width: 600, height: 600))
whatsappCard.lockFocus()
NSColor(calibratedRed: 0.985, green: 0.975, blue: 0.945, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: 600, height: 600).fill()

drawLogo(in: NSRect(x: 38, y: 476, width: 88, height: 88))
drawText("Neeru’s Kitchen", at: NSPoint(x: 150, y: 518), font: .systemFont(ofSize: 32, weight: .heavy), color: ink)
drawText("100% VEGETARIAN · HOME-COOKED", at: NSPoint(x: 152, y: 487), font: .systemFont(ofSize: 11, weight: .bold), color: muted, tracking: 0.9)
drawText("Fresh food.", at: NSPoint(x: 40, y: 355), font: .systemFont(ofSize: 48, weight: .heavy), color: ink)
drawText("Feels like home.", at: NSPoint(x: 40, y: 297), font: .systemFont(ofSize: 48, weight: .heavy), color: orange)
drawText("ORDER TODAY", at: NSPoint(x: 42, y: 91), font: .systemFont(ofSize: 15, weight: .bold), color: orange, tracking: 1.3)
drawText("neerus-kitchen.netlify.app", at: NSPoint(x: 42, y: 58), font: .systemFont(ofSize: 16, weight: .bold), color: ink)

if let photo = NSImage(contentsOf: photoURL) {
  let photoFrame = NSRect(x: 350, y: 34, width: 210, height: 210)
  NSGraphicsContext.saveGraphicsState()
  NSBezierPath(ovalIn: photoFrame).addClip()
  let side = min(photo.size.width, photo.size.height)
  let source = NSRect(x: (photo.size.width - side) / 2, y: (photo.size.height - side) / 2, width: side, height: side)
  photo.draw(in: photoFrame, from: source, operation: .sourceOver, fraction: 1)
  NSGraphicsContext.restoreGraphicsState()
  NSColor.white.setStroke()
  let photoBorder = NSBezierPath(ovalIn: photoFrame.insetBy(dx: -6, dy: -6))
  photoBorder.lineWidth = 12
  photoBorder.stroke()
}

whatsappCard.unlockFocus()
try writeJPEG(whatsappCard, name: "neerus-kitchen-whatsapp-v4.jpg", quality: 0.80)

for size in [180, 192, 512] {
  let icon = NSImage(size: NSSize(width: size, height: size))
  icon.lockFocus()
  NSColor(calibratedRed: 0.985, green: 0.975, blue: 0.945, alpha: 1).setFill()
  NSRect(x: 0, y: 0, width: size, height: size).fill()
  let inset = CGFloat(size) * 0.12
  drawLogo(in: NSRect(x: inset, y: inset, width: CGFloat(size) - inset * 2, height: CGFloat(size) - inset * 2))
  icon.unlockFocus()
  let name = size == 180 ? "apple-touch-icon.png" : "icon-\(size).png"
  try writePNG(icon, name: name)
}
