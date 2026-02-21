const app = document.getElementById("app");
// This lesson updates the preview panel as you complete each guided block.

// This section focuses on returns tax. [LESSON:returns-tax]
function calculateTax(amount, rate) {
    return amount * rate;
}

// This section focuses on returns total. [LESSON:returns-total]
function calculateTotal(subtotal, rate) {
    const tax = calculateTax(subtotal, rate);
    return subtotal + tax;
}

// This section focuses on returns render. [LESSON:returns-render]
const subtotal = 24;
const total = calculateTotal(subtotal, 0.08);
app.textContent = "Subtotal $" + subtotal.toFixed(2) + " • Total $" + total.toFixed(2);

// Beginner JS 05: Return Values
// Function returns
