export function getFormattedDateTime(): string {
    const date = new Date();
  
    // Format date as MM/DD/YY
    const formattedDate = date.toLocaleDateString('en-US', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
  
    // Format time as HH:mm:ss
    const formattedTime = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false, // Use 24-hour format
    });
  
    // Combine date and time
    return `${formattedDate}, ${formattedTime}`;
  }
  